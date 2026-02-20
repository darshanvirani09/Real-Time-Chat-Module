import { Model } from '@nozbe/watermelondb'
import { field, date } from '@nozbe/watermelondb/decorators'

export default class User extends Model {
    static table = 'users'

    @field('name') name!: string
    @field('avatar') avatar!: string | null
    @date('created_at') createdAt!: number | Date
}
